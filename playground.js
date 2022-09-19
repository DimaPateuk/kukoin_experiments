const {
  Subject,
  tap,
  takeUntil,
  interval,
  merge,
} = require('rxjs');

const socketCloseSubject = new Subject();
const strategyEndSubject = new Subject();

interval(100).pipe(
  tap((e) => {
    console.log(e);
  }),
  takeUntil(
    merge(
      socketCloseSubject
      .pipe(
        tap(() => {
          console.log('socketCloseSubject');
        })
      ),
      strategyEndSubject
        .pipe(
          tap(() => {
            console.log('strategyEndSubject');
          })
        )
    ))
).subscribe();

