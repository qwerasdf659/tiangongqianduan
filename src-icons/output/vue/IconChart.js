import { defineComponent, h } from 'vue';

export const IconChart = defineComponent({
  name: 'IconChart',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        
      ]
    );
  }
});
